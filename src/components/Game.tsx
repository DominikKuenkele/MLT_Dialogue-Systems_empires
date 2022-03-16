import {Status} from "./Status";
import {useMachine} from "@xstate/react";
import {gameMachine} from "../machines/GameMachine";
import {assign, spawn} from "xstate";
import uuid from "uuid-v4";
import {createGameBoardMachine} from "../machines/GameBoardMachine";
import {dummyRef} from "../Util";
import {GameBoard} from "./GameBoard";


const createDefaultGameBoard = (x: number, y: number) => {
    const defaultGameBoard = [];
    for (let row = 0; row < y; row++) {
        let gameBoardRow = [];
        for (let col = 0; col < x; col++) {
            let r = row - Math.floor(col/2);
            gameBoardRow.push({
                hexCoordinate: {
                    q: col,
                    r: r,
                    s: -col-r
                },
                unit: dummyRef
            });
        }
        defaultGameBoard.push(gameBoardRow);
    }
    return defaultGameBoard;
}

export function Game() {
    const number_tiles_x = 15;
    const number_tiles_y = 10;
    const tile_size = 6;

    const [gameState, send] = useMachine(gameMachine, {
            devTools: true,
            actions: {
                createGameBoard: assign({
                    gameBoard: () => ({
                        id: uuid(),
                        ref: spawn(createGameBoardMachine({
                            gameBoard: createDefaultGameBoard(number_tiles_x, number_tiles_y)
                        }))
                    })
                })
            }
        }
    );

    return (
        <div className={"app"}>
            {gameState.context.gameBoard.id !== '' ?
                <div>
                    <Status/>
                    <GameBoard numberTilesX={number_tiles_x}
                               numberTileY={number_tiles_y}
                               tileSize={tile_size}
                               gameBoardRef={gameState.context.gameBoard.ref}/>
                </div> :
                <div onClick={() => send({type: 'START'})}>Start Game</div>
            }
        </div>
    )
}
