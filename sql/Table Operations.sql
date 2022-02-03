CREATE TABLE games (
    sender_id       varchar(30) PRIMARY KEY,
    fen             varchar(100),
    level           integer,
    is_white_pov    boolean DEFAULT true,
    is_bots_turn    boolean DEFAULT false,
    created_on      timestamp with time zone DEFAULT current_timestamp    
);
