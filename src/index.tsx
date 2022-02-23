import ReactDOM from "react-dom";
import {HexGrid, Layout, Hexagon, GridGenerator, Pattern} from 'react-hexgrid';
import "./styles.scss";
import archer from "./archer.jpg"
import {useMachine} from "@xstate/react";
import {gameMachine} from "./Game"
import {inspect} from "@xstate/inspect";

inspect({
    url: "https://statecharts.io/inspect",
    iframe: false
});

const arrow: JSX.Element = <svg viewBox="0 0 1500 1500"><path d="M354.295,84.173c26.361,8.117,55.507,1.468,75.511-18.533c3.905-3.905,3.905-10.237,0-14.142
	c-3.905-3.905-10.236-3.906-14.142,0c-17.878,17.877-45.771,21.204-67.831,8.09C308.19,36.02,260.991,26.046,214.936,31.508
	c-43.519,5.159-83.275,23.139-115.7,52.184L82.912,67.369c4.818-8.462,6.081-18.493,3.305-28.265
	C82.686,26.676,73.158,17.148,60.73,13.617L14.133,0.381C10.645-0.61,6.895,0.365,4.33,2.929c-2.564,2.564-3.539,6.315-2.548,9.803
	L15.018,59.33c3.531,12.428,13.059,21.956,25.487,25.487c3.432,0.975,6.896,1.452,10.313,1.452c6.311,0,12.456-1.638,17.946-4.762
	l16.199,16.199c-30.617,32.948-49.54,73.793-54.856,118.632c-5.46,46.055,4.512,93.253,28.08,132.898
	c13.114,22.06,9.787,49.953-8.09,67.831c-3.905,3.905-3.905,10.237,0,14.142c1.953,1.953,4.512,2.929,7.071,2.929
	s5.119-0.977,7.071-2.929c20.001-20.002,26.651-49.15,18.533-75.511l130.091-130.091l63.981,63.981l3.259,42.378
	c0.184,2.38,1.212,4.616,2.899,6.304l56.698,56.698c1.907,1.907,4.463,2.929,7.072,2.929c1.087,0,2.183-0.177,3.244-0.542
	c3.612-1.24,6.204-4.428,6.678-8.218l3.761-30.081l30.081-3.76c3.79-0.474,6.979-3.065,8.219-6.677
	c1.239-3.613,0.313-7.616-2.388-10.316l-56.698-56.698c-1.688-1.688-3.924-2.716-6.305-2.899l-42.379-3.26l-63.981-63.981
	L354.295,84.173z M339.386,366.367l-39.625-39.625l-1.187-15.426l42.395,42.394L339.386,366.367z M367.768,337.986l-12.657,1.582
	l-42.394-42.393l15.426,1.186L367.768,337.986z M334.95,75.234L212.863,197.32l-99.461-99.461
	C174.601,43.807,263.632,34.36,334.95,75.234z M45.97,65.578c-5.711-1.623-10.09-6.001-11.713-11.713l-8.335-29.344l29.344,8.335
	c5.711,1.623,10.09,6.001,11.713,11.713c1.709,6.018,0.089,12.251-4.334,16.674S51.988,67.287,45.97,65.578z M73.832,336.351
	c-41.534-72.473-31.108-163.234,25.282-224.495l99.607,99.607L73.832,336.351z"/></svg>

const rootElement = document.getElementById("root");

const testGameMachine = gameMachine.withContext({sizeOfBoard: 0, numberOfPlayers: 0})

function App() {
    const [state, send] = useMachine(testGameMachine, {devTools: true});
    const hexagons = GridGenerator.hexagon(5);
    return (
        <div>
            <HexGrid width={1000} height={800}>
                <Layout size={{x: 5, y: 5}}>
                    {hexagons.map((hex: any, i: number) => <Hexagon key={i} q={hex.q} r={hex.r} s={hex.s}>
                        {arrow}
                        <polygon points="-2,-2 2,-2 2,2 -2,2"
                                 style={state.context.sizeOfBoard > 10 ? {} : {display: "none"}}/>
                    </Hexagon>)}
                </Layout>
                <Pattern id="pat-1" link={archer} size={{x: 5, y: 5}}/>
            </HexGrid>
            <svg width="400" height="250">
                <polygon points="220,30 270,210 180,230" fill="url(#test-pat)"/>
                <pattern>
                    <image id="test-pat" href={archer}/>
                </pattern>
            </svg>
            <img alt="could not load" src={archer}/>
        </div>
    );
}

ReactDOM.render(
    <App/>,
    rootElement);