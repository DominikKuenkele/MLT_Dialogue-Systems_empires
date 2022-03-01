import React from "react";

export const GameBoardContext = React.createContext({
    number_tiles_x: 15,
    number_tiles_y: 10,
    tile_size: 6
});
