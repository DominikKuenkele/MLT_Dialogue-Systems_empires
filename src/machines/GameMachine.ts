import {createMachine} from "xstate";

const gameMachine = createMachine({
    id: 'game',
    initial: 'settingUp',
    states: {
        settingUp: {
            entry: [

            ],
            always: 'handlingUserEvents'
        },
        handlingUserEvents: {

        },
        processingAI: {

        },
        processingTurn: {

        },
        over: {

        }
    }
});
