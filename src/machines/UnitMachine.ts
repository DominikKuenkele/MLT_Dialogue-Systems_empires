import {createMachine} from "xstate";

const unitMachine = createMachine({
   id: 'unit',
   initial: 'idle',
   states: {
       idle: {

       },
       moving: {

       },
       inAction: {

       },
       dead: {
           type: 'final'
       }
   }
});
