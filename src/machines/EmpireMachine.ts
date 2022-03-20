import {createMachine, send, sendParent} from "xstate";
import {empires, MachineRef} from "../Util";

export interface EmpireContext {
    id: string,
    empire: empires,
    gameBoard: MachineRef,
}

export type EmpireEvents =
    | { type: 'TURN' }
    | { type: 'REGISTERED' }
    | { type: 'EXISTS_NOT' }
    | { type: 'OCC_ALLY' }
    | { type: 'OCC_NOT' }
    | { type: 'OCC_ENEMY' }
    | { type: 'OUT_OF_RANGE' }
    | { type: 'EXECUTED' }
    | { type: 'PROD_IN_PROGRESS' }
    | { type: 'YES' }
    | { type: 'NO' }

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
