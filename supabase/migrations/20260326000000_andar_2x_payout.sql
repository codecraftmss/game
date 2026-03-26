-- Update settle_round: ANDAR now pays 2x (same as BAHAR)
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
            -- Both ANDAR and BAHAR now pay 2x (stake × 2)
            -- The original stake was already deducted on bet placement,
            -- so we credit back: stake + stake profit = amount * 2
            v_payout := v_bet.amount * 2.0;
            
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
            -- User loses (balance was already deducted on placement)
            UPDATE public.bets SET status = 'LOST' WHERE id = v_bet.id;
        END IF;
        v_count := v_count + 1;
    END LOOP;
    
    RETURN jsonb_build_object('success', true, 'processed', v_count, 'total_payout', v_total_payout);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
