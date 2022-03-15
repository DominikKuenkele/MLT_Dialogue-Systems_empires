import React from 'react';
import {Hexagon} from 'react-hexgrid';
import {GamePiece} from "./GamePiece";


interface GameTileProps {
    q: number,
    r: number,
    s: number,
    unitRef: any,
    unitId: string
}

export function GameTile(props: GameTileProps) {
    return (
        <Hexagon q={props.q} r={props.r} s={props.s}>
            {Object.entries(props.unitRef).length !== 0 && <GamePiece unitRef={props.unitRef} unitId={props.unitId}/>}
        </Hexagon>
    );
}

