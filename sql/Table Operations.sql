CREATE TYPE game_status AS ENUM ('In Progress', 'White Won', 'Black Won', 'Draw', 'Stalemate', 'Threefold Repetition', 'Insufficient Material', 'Abandoned', 'Not Started');

CREATE TABLE games (
    sender_id       varchar(30) PRIMARY KEY,
    fen             varchar(100),
    pgn             text,
    level           integer,
    status          game_status,
    is_player_white boolean,
    is_white_pov    boolean DEFAULT true,
    is_bots_turn    boolean DEFAULT false,
    created_on      timestamp with time zone DEFAULT current_timestamp    
);


CREATE TABLE games_archive (
    sender_id       varchar(30),
    fen             varchar(100),
    pgn             text,
    level           integer,
    status          game_status,
    is_player_white boolean,
    created_on      timestamp with time zone,
    archived_on     timestamp with time zone DEFAULT current_timestamp
);