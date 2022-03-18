import {createMachine, send, sendParent} from "xstate";
import {empires, MachineRef} from "../Util";

export interface EmpireContext {
    id: string,
    empire: empires,
    gameBoard: MachineRef,
}

export type EmpireEvents =
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
            entry: 'registerAtGameBoard',
            on: {
                REGISTERED: {
                    target: 'waiting',
                    actions: sendParent('EMPIRE_READY')
                }
            },
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
}, {
    actions: {
        registerAtGameBoard: send((context) => ({
                type: 'REGISTER',
                empire: context.empire
            }),
            {
                to: context => context.gameBoard.ref
            }
        )
    }
});
