import {Action, assign, createMachine, send, spawn} from "xstate";
import {MachineRef} from "../Util";
import uuid from "uuid-v4";
import {createSpeechRecognitionMachine} from "./SpeechRecognitionMachine";

function say(text: (context: DialogueContext) => string): Action<DialogueContext, any> {
    return send((_context: DialogueContext) => ({
        type: "SPEAK",
        value: text(_context)
    }), {
        to: context => context.speechRecMachine.ref
    })
}

interface DialogueContext {
    speechRecMachine: MachineRef
}

type DialogeEvents =
    {
        type: 'DUMMY'
    }

export const createDialogueMachine = (initialContext: DialogueContext) => createMachine<DialogueContext, DialogeEvents>({
        id: 'dm',
        context: {
            ...initialContext
        },
        initial: 'settingUp',
        states: {
            settingUp: {
                entry: send('CLICK', {to: context => context.speechRecMachine.ref}),
                after: {
                    2000: 'getCommand'

                }
            },
            getCommand: {
                entry: say(() => 'Hello')
            }
        }
    },
    {
        actions: {

        }
    }
);
