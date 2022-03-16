import {createMachine, send, sendParent} from "xstate";
import {empires, MachineRef} from "../Util";

export interface EmpireContext {
    id: string,
    empire: empires,
    gameBoard: MachineRef
}

type EmpireEvents =
    {
        type: 'TURN'
    } |
    {
        type: 'REGISTERED'
    }

export const createEmpireMachine = (initialContext: EmpireContext) => createMachine<EmpireContext, EmpireEvents>({
    id: 'empire',
    context: {
        ...initialContext
    },
    initial: 'settingUp',
    states: {
        settingUp: {
            entry: send((context) => ({
                    type: 'REGISTER',
                    empire: context.empire
                }),
                {
                    to: context => context.gameBoard.ref
                }
            ),
            on: {
                REGISTERED: [
                    {
                        actions: sendParent('EMPIRE_READY'),
                        target: 'waiting'
                    }
                ]
            }
        },
        turn: {},
        waiting: {
            on: {
                TURN: 'turn'
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
