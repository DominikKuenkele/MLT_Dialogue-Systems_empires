import React from 'react';
import {Hexagon} from 'react-hexgrid';
import {GamePiece} from "./GamePiece";


interface GameTileProps {
    q: number,
    r: number,
    s: number,
    hasArrow: boolean
}

export function GameTile(props: GameTileProps) {
    return (
        <Hexagon q={props.q} r={props.r} s={props.s}>
            {props.hasArrow && <GamePiece empire={""}/>}
        </Hexagon>
    );
}

