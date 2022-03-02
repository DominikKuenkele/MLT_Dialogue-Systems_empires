import {assign, Machine} from "xstate";

interface GameMachineContext {
    numberOfPlayers: number;
    sizeOfBoard: number;
    field: { x: string, y: number }
}

export type GameMachineEvent =
    { type: 'READY' } |
    { type: 'PROCESSED' } |
    { type: 'TURN' } |
    { type: 'GAME_ENDING' };

const fields: { x: string, y: number }[] = [
    {x: 'A', y: 5},
    {x: 'E', y: 10},
    {x: 'F', y: 2},
    {x: 'C', y: 4}
]

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
                        assign({field: fields[Math.random() * fields.length | 0]})
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
