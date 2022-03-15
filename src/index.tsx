import ReactDOM from "react-dom";
import "./styles.scss";
import {inspect} from "@xstate/inspect";
import {Status} from "./components/Status";
import {GameBoard} from "./components/GameBoard";

inspect({
    url: "https://statecharts.io/inspect",
    iframe: false
});



function App() {
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
