import React from "react";
import {GridGenerator, HexGrid, Layout} from "react-hexgrid";
import {GameTile} from "./GameTile";
import {useActor} from "@xstate/react";
import {ActorRef} from "xstate";


function getGameBoardDimensions(numberTilesX: number, numberTilesY: number, tileSize: number) {
    const width = numberTilesX * (tileSize * 1.5 + 1) + tileSize / 2

    const hexagon_height = Math.sqrt(tileSize ** 2 - (tileSize / 2) ** 2)
    const height = numberTilesY * (hexagon_height * 2 + 1) + hexagon_height

    return [width, height]
}

interface GameBoardProps {
    numberTilesX: number,
    numberTileY: number,
    tileSize: number,
    gameBoardRef: ActorRef<any>
}

export function GameBoard(props: GameBoardProps) {
    const [gameBoardWidth, gameBoardHeight] = getGameBoardDimensions(props.numberTilesX, props.numberTileY, props.tileSize)
    const hexagons: HexGridType = GridGenerator.orientedRectangle(props.numberTilesX, props.numberTileY);

    const [gameBoardState] = useActor(props.gameBoardRef);

    return (
        <div className={'gameBoard'}>
            <HexGrid width="auto" height="96vh"
                     viewBox={-props.tileSize + " " + -props.tileSize + " " + gameBoardWidth + " " + gameBoardHeight}>
                <Layout size={{x: props.tileSize, y: props.tileSize}} spacing={1.05}>
                    {hexagons.map((hex: any, i: number) => {
                        const unit = gameBoardState.context.gameBoard[i % props.numberTileY][hex.q].unit
                        return <GameTile key={i} q={hex.q} r={hex.r} s={hex.s}
                                         unitRef={unit.ref} unitId={unit.id}/>
                    })}
                </Layout>
            </HexGrid>
        </div>
    );
}
