import {Machine} from "xstate";

interface EmpireMachineContext {

}
type EmpireMachineEvent =
    {type: 'READY'} |
    {type: 'PROCESSED'} |
    {type: 'TURN'} |
    {type: 'GAME_ENDING'};

const empireMachine = Machine<EmpireMachineContext, any, EmpireMachineEvent>({
    id: 'game',
    initial: 'settingUp',
    states: {
        settingUp: {
            on: {
                READY: 'running'
            }
        },
        running: {
            on: {
                TURN: 'processingTurn'
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