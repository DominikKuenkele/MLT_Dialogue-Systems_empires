import React from 'react';
import {Hexagon, Text} from 'react-hexgrid';
import {GamePiece} from "./GamePiece";
import {ActorRef} from "xstate";


interface GameTileProps {
    q: number,
    r: number,
    s: number,
    unitRef: ActorRef<any>,
    unitId: string
}

function hexToChess(q: number, r: number, s: number){
    return `${(q + 10).toString(36).toUpperCase()}${Math.floor((r-s)/2)+1}`
}

export function GameTile(props: GameTileProps) {
    return (
        <Hexagon q={props.q} r={props.r} s={props.s}>
            {Object.entries(props.unitRef).length !== 0 && <GamePiece unitRef={props.unitRef} unitId={props.unitId}/>}
            <Text y={4.5}>{hexToChess(props.q, props.r, props.s)}</Text>
        </Hexagon>
    );
}

