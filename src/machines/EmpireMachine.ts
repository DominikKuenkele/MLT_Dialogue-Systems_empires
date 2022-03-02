import {createMachine, Machine} from "xstate";

const empireMachine = createMachine({
    id: 'empire',
    initial: 'settingUp',
    states: {
        settingUp: {
            entry: [],
            always: 'turn'
        },
        turn: {},
        waiting: {
            on: {
                TURN: 'processingTurn'
            }
        },
        defeated: {
            type: 'final'
        },
        victorious: {
            type: 'final'
        }
    }
});
