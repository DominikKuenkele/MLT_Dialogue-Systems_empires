import React, {useContext} from "react";
import {GridGenerator, HexGrid, HexUtils, Layout} from "react-hexgrid";
import {GameTile} from "./GameTile";
import {GameBoardContext} from "./GameBoardContext";
import {useMachine} from "@xstate/react";
import {dummyUnit, getUnit, getUnitLocation, MapContext, MapEvents, mapMachine, UnitRef} from "../machines/MapMachine";
import {send} from "xstate";
import {UnitContext} from "../machines/UnitMachine";
import {location} from "../Util";


function getGameBoardDimensions(number_tiles_x: number, number_tiles_y: number, tile_size: number) {
    const width = number_tiles_x * (tile_size * 1.5 + 1) + tile_size / 2

    const hexagon_height = Math.sqrt(tile_size ** 2 - (tile_size / 2) ** 2)
    const height = number_tiles_y * (hexagon_height * 2 + 1) + hexagon_height

    return [width, height]
}


// function convertToHexgrid(field: { x: string, y: number }) {
//     return field.y - 1 + (parseInt(field.x, 36) - 10) * hexagon_number_y
// }


const createDefaultMap = (x: number, y: number) => {
    const defaultMap = [];
    for (let row = 0; row < y; row++) {
        let mapRow = [];
        for (let col = 0; col < x; col++) {
            mapRow.push(dummyUnit);
        }
        defaultMap.push(mapRow);
    }
    return defaultMap;
}

function getDistance(location1: location, location2: location, hexagons: any, number_tiles_y: number) {
    const sourceHex = hexagons.find((hex, i: number) => hex.q === location1.x && i % number_tiles_y === location1.y);
    const targetHex = hexagons.find((hex, i: number) => hex.q === location2.x && i % number_tiles_y === location2.y);

    return HexUtils.distance(sourceHex, targetHex);
}

const map = mapMachine.withContext({
    map: createDefaultMap(15, 10)
})

interface GameBoardProps {

}

export function GameBoard(props: GameBoardProps) {
    const {number_tiles_x, number_tiles_y, tile_size} = useContext(GameBoardContext)
    const [gameBoardWidth, gameBoardHeight] = getGameBoardDimensions(number_tiles_x, number_tiles_y, tile_size)

    const hexagons = GridGenerator.orientedRectangle(number_tiles_x, number_tiles_y);


    const [mapState] = useMachine(map, {
        devTools: true,
        actions: {
            applyReceivedDamage: send(
                (context, event) => {
                    const [row, col] = getUnitLocation(event.id, context.map);
                    const sourceUnitRef = getUnit(event.id, context.map).ref
                    const sourceUnit: UnitContext = sourceUnitRef.getSnapshot().context
                    const targetUnitRef = context.map[event.y][event.x].ref
                    const targetUnit: UnitContext = targetUnitRef.getSnapshot().context

                    const distance = getDistance(
                        {x: col, y: row},
                        {x: event.x, y: event.y},
                        hexagons,
                        number_tiles_y
                    );

                    let damage = 0
                    if (distance <= targetUnit.attackRange) {
                        damage = targetUnit.attack
                        if (targetUnit.effective.includes(sourceUnit.type)) {
                            damage *= 2;
                        } else if (targetUnit.ineffective.includes(sourceUnit.type)) {
                            damage /= 2;
                        }
                    }

                    return {
                        type: 'DAMAGE',
                        damage: damage
                    }
                },
                {
                    to: (context: MapContext, event: MapEvents) => getUnit(event.id, context.map).ref
                }
            )
        },
        guards: {
            outOfRange: (context: MapContext, event: MapEvents) => {
                if (event.x >= number_tiles_x || event.x < 0 ||
                    event.y >= number_tiles_y || event.y < 0) {
                    return true;
                }
                const [row, col] = getUnitLocation(event.id, context.map);
                const sourceUnit = getUnit(event.id, context.map).ref.getSnapshot();
                const distance = getDistance(
                    {x: col, y: row},
                    {x: event.x, y: event.y},
                    hexagons,
                    number_tiles_y
                );

                let unitRange;
                switch (event.type) {
                    case "MOVE":
                        unitRange = sourceUnit.context.moveRange;
                        break;
                    case "ATTACK":
                        unitRange = sourceUnit.context.attackRange;
                        break;
                    default:
                        // should not happen
                        unitRange = 1
                }

                return distance > unitRange
            }
        }
    });


    return (
        <div>
            <HexGrid width="auto" height="100vh"
                     viewBox={-tile_size + " " + -tile_size + " " + gameBoardWidth + " " + gameBoardHeight}>
                <Layout size={{x: tile_size, y: tile_size}} spacing={1.05}>
                    {hexagons.map((hex: any, i: number) => {
                        const unit = mapState.context.map[i % number_tiles_y][hex.q]
                        return <GameTile key={i} q={hex.q} r={hex.r} s={hex.s}
                                         unitRef={unit.ref} unitId={unit.id}/>
                    })}
                </Layout>
            </HexGrid>
        </div>
    );
}
