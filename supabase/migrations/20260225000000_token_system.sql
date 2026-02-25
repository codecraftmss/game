-- Step 3: NEW DATABASE STRUCTURE

-- Update Existing profiles Table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS token_balance DECIMAL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_win_amount DECIMAL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_loss_amount DECIMAL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_deposit_amount DECIMAL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_withdraw_amount DECIMAL DEFAULT 0,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create token_transactions Table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_type') THEN
        CREATE TYPE transaction_type AS ENUM (
            'admin_add', 
            'admin_withdraw', 
            'deposit', 
            'withdraw', 
            'game_win', 
            'game_loss'
        );
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_status') THEN
        CREATE TYPE transaction_status AS ENUM ('success', 'pending', 'failed');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS token_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    admin_id UUID REFERENCES profiles(id),
    transaction_type transaction_type NOT NULL,
    amount DECIMAL NOT NULL,
    before_balance DECIMAL NOT NULL,
    after_balance DECIMAL NOT NULL,
    status transaction_status DEFAULT 'success',
    reference_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_token_transactions_user_id ON token_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_token_transactions_created_at ON token_transactions(created_at);

-- Trigger to update updated_at on profiles
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

-- RPC Function to handle token transactions safely
CREATE OR REPLACE FUNCTION process_token_transaction(
    p_user_id UUID,
    p_admin_id UUID,
    p_transaction_type transaction_type,
    p_amount DECIMAL,
    p_reference_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_before_balance DECIMAL;
    v_after_balance DECIMAL;
    v_profile_record RECORD;
BEGIN
    -- Get current balance and lock row for update
    SELECT * INTO v_profile_record FROM profiles WHERE id = p_user_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'User not found');
    END IF;
    
    v_before_balance := COALESCE(v_profile_record.token_balance, 0);
    
    -- Calculate new balance
    IF p_transaction_type IN ('admin_add', 'deposit', 'game_win') THEN
        v_after_balance := v_before_balance + p_amount;
    ELSIF p_transaction_type IN ('admin_withdraw', 'withdraw', 'game_loss') THEN
        v_after_balance := v_before_balance - p_amount;
    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'Invalid transaction type');
    END IF;
    
    -- Prevent negative balance
    IF v_after_balance < 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Insufficient balance');
    END IF;
    
    -- Update profiles table
    UPDATE profiles SET 
        token_balance = v_after_balance,
        total_win_amount = total_win_amount + CASE WHEN p_transaction_type = 'game_win' THEN p_amount ELSE 0 END,
        total_loss_amount = total_loss_amount + CASE WHEN p_transaction_type = 'game_loss' THEN p_amount ELSE 0 END,
        total_deposit_amount = total_deposit_amount + CASE WHEN p_transaction_type = 'deposit' OR p_transaction_type = 'admin_add' THEN p_amount ELSE 0 END,
        total_withdraw_amount = total_withdraw_amount + CASE WHEN p_transaction_type = 'withdraw' OR p_transaction_type = 'admin_withdraw' THEN p_amount ELSE 0 END,
        updated_at = NOW()
    WHERE id = p_user_id;
    
    -- Log transaction
    INSERT INTO token_transactions (
        user_id, admin_id, transaction_type, amount, before_balance, after_balance, status, reference_id
    ) VALUES (
        p_user_id, p_admin_id, p_transaction_type, p_amount, v_before_balance, v_after_balance, 'success', p_reference_id
    );
    
    RETURN jsonb_build_object(
        'success', true, 
        'before_balance', v_before_balance, 
        'after_balance', v_after_balance
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Table for tracking active bets
CREATE TABLE IF NOT EXISTS bets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    side TEXT NOT NULL, -- 'ANDAR' or 'BAHAR'
    amount DECIMAL NOT NULL,
    status TEXT DEFAULT 'PLACED', -- 'PLACED', 'WON', 'LOST', 'VOID'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bets_user_id ON bets(user_id);
CREATE INDEX IF NOT EXISTS idx_bets_room_id_round ON bets(room_id, round_number);

-- RPC to place a bet safely
CREATE OR REPLACE FUNCTION place_bet(
    p_user_id UUID,
    p_room_id UUID,
    p_round_number INTEGER,
    p_side TEXT,
    p_amount DECIMAL
) RETURNS JSONB AS $$
DECLARE
    v_res JSONB;
BEGIN
    -- Deduct tokens using the existing process_token_transaction function
    v_res := process_token_transaction(
        p_user_id,
        NULL,
        'game_loss'::transaction_type, -- Initial bet is a 'loss' from balance
        p_amount,
        'Bet placed on ' || p_side || ' in Round ' || p_round_number
    );
    
    IF (v_res->>'success')::BOOLEAN THEN
        INSERT INTO bets (user_id, room_id, round_number, side, amount)
        VALUES (p_user_id, p_room_id, p_round_number, p_side, p_amount);
        RETURN jsonb_build_object('success', true, 'new_balance', v_res->>'after_balance');
    ELSE
        RETURN v_res;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC to settle all bets in a round
CREATE OR REPLACE FUNCTION settle_round(
    p_room_id UUID,
    p_round_number INTEGER,
    p_winning_side TEXT
) RETURNS JSONB AS $$
DECLARE
    v_bet RECORD;
    v_payout DECIMAL;
    v_total_payout DECIMAL := 0;
    v_count INTEGER := 0;
BEGIN
    FOR v_bet IN 
        SELECT * FROM bets 
        WHERE room_id = p_room_id AND round_number = p_round_number AND status = 'PLACED'
    LOOP
        IF v_bet.side = p_winning_side THEN
            -- User wins
            -- Payout depends on odds. For simplicity: 
            -- Andar: 0.9:1 (Win 0.9 + original 1 = 1.9 total) 
            -- Bahar: 1:1 (Win 1 + original 1 = 2.0 total)
            -- But the 'loss' was already deducted. So we add back (Win + Original).
            
            IF p_winning_side = 'ANDAR' THEN
                v_payout := v_bet.amount * 1.9;
            ELSE
                v_payout := v_bet.amount * 2.0;
            END IF;
            
            PERFORM process_token_transaction(
                v_bet.user_id,
                NULL,
                'game_win'::transaction_type,
                v_payout,
                'Win on ' || p_winning_side || ' in Round ' || p_round_number
            );
            
            UPDATE bets SET status = 'WON' WHERE id = v_bet.id;
            v_total_payout := v_total_payout + v_payout;
        ELSE
            -- User loses (Balance was already deducted)
            UPDATE bets SET status = 'LOST' WHERE id = v_bet.id;
        END IF;
        v_count := v_count + 1;
    END LOOP;
    
    RETURN jsonb_build_object('success', true, 'processed', v_count, 'total_payout', v_total_payout);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
