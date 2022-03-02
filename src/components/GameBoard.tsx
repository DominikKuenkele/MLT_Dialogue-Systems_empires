import React, {useContext} from "react";
import {GridGenerator, HexGrid, Layout} from "react-hexgrid";
import {GameTile} from "./GameTile";
import {GameBoardContext} from "./GameBoardContext";


function getGameBoardDimensions(number_tiles_x: number, number_tiles_y: number, tile_size: number) {
    const width = number_tiles_x * (tile_size * 1.5 + 1) + tile_size / 2

    const hexagon_height = Math.sqrt(tile_size ** 2 - (tile_size / 2) ** 2)
    const height = number_tiles_y * (hexagon_height * 2 + 1) + hexagon_height

    return [width, height]
}


function convertToHexgrid(field: { x: string, y: number }) {
    return field.y - 1 + (parseInt(field.x, 36) - 10) * hexagon_number_y
}


interface GameBoardProps {

}

export function GameBoard(props: GameBoardProps) {
    const {number_tiles_x, number_tiles_y, tile_size} = useContext(GameBoardContext)
    const [gameBoardWidth, gameBoardHeight] = getGameBoardDimensions(number_tiles_x, number_tiles_y, tile_size)

    const hexagons = GridGenerator.orientedRectangle(number_tiles_x, number_tiles_y).map((x: any) => ({
        key: x,
        arrow: true
    }));

    return (
        <div>
            <HexGrid width="auto" height="100vh"
                     viewBox={-tile_size + " " + -tile_size + " " + gameBoardWidth + " " + gameBoardHeight}>
                <Layout size={{x: tile_size, y: tile_size}} spacing={1.05}>
                    {hexagons.map((hex: any, i: number) => <GameTile key={i} q={hex.key.q} r={hex.key.r} s={hex.key.s}
                                                                     hasArrow={hex.arrow}/>)}
                </Layout>
            </HexGrid>
        </div>
    );
}
