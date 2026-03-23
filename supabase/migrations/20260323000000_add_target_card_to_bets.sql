-- Add target_card column to bets table
ALTER TABLE public.bets ADD COLUMN IF NOT EXISTS target_card TEXT;

-- Update place_bet RPC to handle target_card
CREATE OR REPLACE FUNCTION public.place_bet(
    p_user_id UUID,
    p_room_id UUID,
    p_round_number INTEGER,
    p_side TEXT,
    p_amount DECIMAL,
    p_target_card TEXT -- Added parameter
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
        INSERT INTO public.bets (user_id, room_id, round_number, side, amount, target_card)
        VALUES (p_user_id, p_room_id, p_round_number, p_side, p_amount, p_target_card);
        RETURN jsonb_build_object('success', true, 'new_balance', v_res->>'after_balance');
    ELSE
        RETURN v_res;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update settle_round RPC to store target_card in bets
CREATE OR REPLACE FUNCTION public.settle_round(
    p_room_id UUID,
    p_round_number INTEGER,
    p_winning_side TEXT
) RETURNS JSONB AS $$
DECLARE
    v_bet RECORD;
    v_payout DECIMAL;
    v_total_payout DECIMAL := 0;
    v_count INTEGER := 0;
    v_target_card TEXT;
BEGIN
    -- Get the target card from game_state for this room
    SELECT target_card INTO v_target_card FROM public.game_state WHERE room_id = p_room_id;

    FOR v_bet IN 
        SELECT * FROM public.bets 
        WHERE room_id = p_room_id AND round_number = p_round_number AND status = 'PLACED'
    LOOP
        -- Also update the target_card in the specific bet record if missing or latest
        UPDATE public.bets SET target_card = COALESCE(v_target_card, target_card) WHERE id = v_bet.id;

        IF v_bet.side = p_winning_side THEN
            -- User wins
            IF p_winning_side = 'ANDAR' THEN
                v_payout := v_bet.amount * 1.9;
            ELSE
                v_payout := v_bet.amount * 2.0;
            END IF;
            
            PERFORM public.process_token_transaction(
                v_bet.user_id,
                NULL,
                'game_win'::transaction_type,
                v_payout,
                'Win on ' || p_winning_side || ' in Round ' || p_round_number
            );
            
            UPDATE public.bets SET status = 'WON' WHERE id = v_bet.id;
            v_total_payout := v_total_payout + v_payout;
        ELSE
            -- User loses
            UPDATE public.bets SET status = 'LOST' WHERE id = v_bet.id;
        END IF;
        v_count := v_count + 1;
    END LOOP;
    
    RETURN jsonb_build_object('success', true, 'processed', v_count, 'total_payout', v_total_payout);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
