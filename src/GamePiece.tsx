import React from "react";
import {Archer} from "./Archer"
import {HealthBar} from "./HealthBar";

interface GamePieceProps {
    empire: string
}

export function GamePiece(props: GamePieceProps) {
    return (
        <g>
            <HealthBar health={30} />
            <Archer empire={props.empire}/>
        </g>
    );
}
