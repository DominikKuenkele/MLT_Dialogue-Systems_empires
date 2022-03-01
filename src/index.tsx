import ReactDOM from "react-dom";
import {HexGrid, Layout, GridGenerator} from 'react-hexgrid';
import "./styles.scss";
import {useMachine} from "@xstate/react";
import {gameMachine} from "./Game"
import {inspect} from "@xstate/inspect";
import {GameTile} from './GameTile';
import {Status} from "./Status";
import {GameBoard} from "./GameBoard";

inspect({
    url: "https://statecharts.io/inspect",
    iframe: false
});


const testGameMachine = gameMachine.withContext({sizeOfBoard: 0, numberOfPlayers: 0, field: {x: 'A', y: 3}})

function App() {
    const [state, send] = useMachine(testGameMachine, {devTools: true});

    return (
        <div className={"app"}>
            <Status/>
            <GameBoard/>
        </div>
    );
}

const rootElement = document.getElementById("root");

ReactDOM.render(
    <App/>,
    rootElement);
