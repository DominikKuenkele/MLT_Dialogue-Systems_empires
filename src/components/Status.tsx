import React from "react";
import {empires} from "../Util";
import {Producer} from "../machines/GameBoardMachine";
import {Production} from "./Production";

interface statusProps {
    gameState: string,
    turn: number,
    currentEmpire: empires | undefined,
    userTurn: boolean
    production: Producer | undefined
}

export function Status(props: statusProps) {
    let message = () => {
        switch (props.gameState) {
            case 'won':
                return 'You have won!'
            case 'lost':
                return 'You have lost!'
            default:
                return ''
        }
    }
    return (
        <div className={'status'}>
            <div className={'turn'}><div>Turn</div><div className={'number'}>{props.turn}</div></div>
            <Production production={props.production}/>
            <div>{message()}</div>
        </div>
    );
}
