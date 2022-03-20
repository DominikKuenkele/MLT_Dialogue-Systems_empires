import React from "react";
import {Archer} from "./Archer"
import {HealthBar} from "./HealthBar";
import {useActor} from "@xstate/react";
import {Horseman} from "./Horseman";
import {Spearman} from "./Spearman";
import {units} from "./Unit";
import {Base} from "./Base";
import {ActorRef} from "xstate";
import {GameBoardContext} from "./GameBoardContext";

interface GamePieceProps {
    unitRef: ActorRef<any>,
    unitId: string
}

export function GamePiece(props: GamePieceProps) {
    const [state] = useActor(props.unitRef)

    const {tile_size} = React.useContext(GameBoardContext)

    return (
        <g>
            <HealthBar health={state.context.health} maxHealth={state.context.maxHealth}/>
            {
                (() => {
                    switch (state.context.type) {
                        case units.Archer:
                            return <Archer empire={state.context.empire} size={tile_size}/>
                        case units.Horseman:
                            return <Horseman empire={state.context.empire} size={tile_size}/>
                        case units.Spearman:
                            return <Spearman empire={state.context.empire} size={tile_size}/>
                        case units.Base:
                            return <Base empire={state.context.empire} size={tile_size}/>
                    }
                })()
            }
        </g>
    );
}
