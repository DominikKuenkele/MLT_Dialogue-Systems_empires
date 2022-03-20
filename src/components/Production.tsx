import {Producer} from "../machines/GameBoardMachine";
import {UnitContext} from "../machines/UnitMachine";
import {units} from "./Unit";
import {Archer} from "./Archer";
import {Horseman} from "./Horseman";
import {Spearman} from "./Spearman";
import React from "react";

export interface ProductionContext {
    production: Producer | undefined
}

export function Production(props: ProductionContext) {
    if (!props.production) {
        return <div className={'production'}/>
    }

    let unit = props.production.unit.ref.getSnapshot().context
    let image = (unit: UnitContext) => {
        switch (unit.type) {
            case units.Archer:
                return <Archer empire={unit.empire} size={67}/>
            case units.Horseman:
                return <Horseman empire={unit.empire} size={67}/>
            case units.Spearman:
                return <Spearman empire={unit.empire} size={67}/>
        }
    }

    return (
        <div className={'production'}>
            {image(unit)}
            <div className={'targetTurn'}>{props.production.targetTurn}</div>
        </div>
    )
}
