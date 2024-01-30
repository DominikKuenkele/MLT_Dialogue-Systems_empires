import ReactDOM from "react-dom";
import { Game } from "./components/Game";
import "./styles.scss";

// inspect({
//     url: "https://statecharts.io/inspect",
//     iframe: false
// });

function App() {
    return (
        <Game />
    );
}

const rootElement = document.getElementById("root");

ReactDOM.render(
    <App />,
    rootElement);

