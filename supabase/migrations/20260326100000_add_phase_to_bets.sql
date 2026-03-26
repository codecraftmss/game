-- Add betting_phase column if not exists
ALTER TABLE public.bets ADD COLUMN IF NOT EXISTS betting_phase TEXT DEFAULT '1ST_BET';

-- Update place_bet RPC to accept and store betting_phase
CREATE OR REPLACE FUNCTION public.place_bet(
    p_user_id UUID,
    p_room_id UUID,
    p_round_number INTEGER,
    p_side TEXT,
    p_amount DECIMAL,
    p_target_card TEXT DEFAULT NULL,
    p_betting_phase TEXT DEFAULT '1ST_BET'
) RETURNS JSONB AS $$
DECLARE
    v_res JSONB;
BEGIN
    v_res := process_token_transaction(
        p_user_id,
        NULL,
        'game_loss'::transaction_type,
        p_amount,
        'Bet placed on ' || p_side || ' in Round ' || p_round_number
    );
    
    IF (v_res->>'success')::BOOLEAN THEN
        INSERT INTO public.bets (user_id, room_id, round_number, side, amount, target_card, betting_phase)
        VALUES (p_user_id, p_room_id, p_round_number, p_side, p_amount, p_target_card, p_betting_phase);
        RETURN jsonb_build_object('success', true, 'new_balance', v_res->>'after_balance');
    ELSE
        RETURN v_res;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
