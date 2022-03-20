import React from "react";
import {Producer} from "../machines/GameBoardMachine";
import {Production} from "./Production";

interface statusProps {
    turn: number,
    production: Producer | undefined
}

export function Status(props: statusProps) {
    return (
        <div className={'status'}>
            <div className={'statusElementContainer'}>
                <div className={'turn'}><div>Turn</div><div className={'number'}>{props.turn}</div></div>
                <Production production={props.production}/>
            </div>
        </div>
    );
}
