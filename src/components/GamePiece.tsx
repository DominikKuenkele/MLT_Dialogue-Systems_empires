import React from "react";
import {Archer} from "./Archer"
import {HealthBar} from "./HealthBar";
import {useActor} from "@xstate/react";
import {Horseman} from "./Horseman";
import {Spearman} from "./Spearman";
import {units} from "./Unit";

interface GamePieceProps {
    unitRef: any,
    unitId: string
}

export function GamePiece(props: GamePieceProps) {
    const [state] = useActor(props.unitRef)
    return (
        <g>
            <HealthBar health={state.context.health}/>
            {
                (() => {
                    switch (state.context.type) {
                        case units.Archer:
                            return <Archer empire={state.context.empire}/>
                        case units.Horseman:
                            return <Horseman empire={state.context.empire}/>
                        case units.Spearman:
                            return <Spearman empire={state.context.empire}/>
                    }
                })()
            }
        </g>
    );
}
