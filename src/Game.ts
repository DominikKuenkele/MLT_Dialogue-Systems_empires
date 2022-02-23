import {assign, Machine} from "xstate";

interface GameMachineContext {
    numberOfPlayers: number;
    sizeOfBoard: number
}

export type GameMachineEvent =
    { type: 'READY' } |
    { type: 'PROCESSED' } |
    { type: 'TURN' } |
    { type: 'GAME_ENDING' };

export const gameMachine = Machine<GameMachineContext>({
    id: 'game',
    initial: 'settingUp',
    states: {
        settingUp: {
            entry: assign({sizeOfBoard: 5}),
            always: "running"
        },
        running: {
            on: {
                TURN: {
                    target: 'processingTurn',
                    actions: [
                        assign({sizeOfBoard: (context) => context.sizeOfBoard + 1})
                    ]
                }
            }
        },
        processingTurn: {
            on: {
                PROCESSED: 'running',
                GAME_ENDING: 'over'
            }
        },
        over: {
            type: 'final'
        }
    }
});