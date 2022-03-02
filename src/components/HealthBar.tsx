import React from "react";
import {GameBoardContext} from "./GameBoardContext";

interface HealthBarProps {
    health: number
}

export function HealthBar(props: HealthBarProps) {
    const {tile_size} = React.useContext(GameBoardContext)
    const start_x = -tile_size / 2
    const end_x = start_x + (props.health * tile_size / 100)
    const y = -tile_size / 2 - 1

    let css_classes = "healthbar"
    css_classes += props.health < 50 ? " lowhealth" : ""

    return (
        <line x1={start_x} y1={y} x2={end_x} y2={y} className={css_classes}/>
    );

}
