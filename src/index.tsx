import ReactDOM from "react-dom";
import "./styles.scss";
import {inspect} from "@xstate/inspect";
import {Game} from "./components/Game";

inspect({
    url: "https://statecharts.io/inspect",
    iframe: false
});

function App() {
    return (
        <Game/>
    );
}

const rootElement = document.getElementById("root");

ReactDOM.render(
    <App/>,
    rootElement);

