import {assign, createMachine, send, sendParent, spawn} from "xstate";
import {empires, MachineRef} from "../Util";
import {createDialogueMachine} from "./DialogueMachine";
import uuid from "uuid-v4";

export interface EmpireContext {
    id: string,
    empire: empires,
    gameBoard: MachineRef,
    dialogueMachine: MachineRef,
    speechMachineRef: MachineRef
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
            entry: [
                assign({
                    dialogueMachine: context => {
                        return {
                            id: uuid(),
                            ref: spawn(createDialogueMachine({
                                    speechRecMachine: context.speechMachineRef
                                })
                            )
                        }
                    }
                }),
                send((context) => ({
                        type: 'REGISTER',
                        empire: context.empire
                    }),
                    {
                        to: context => context.gameBoard.ref
                    }
                )
            ],
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
