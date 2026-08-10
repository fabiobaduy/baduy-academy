
from typing import List, Tuple, Dict, Optional
import random

# Tipo de ficha
Tile = Tuple[int, int]

# Todas las combinaciones de fichas en dominó doble 6
ALL_TILES: List[Tile] = [(i, j) for i in range(7) for j in range(i, 7)]


class Player:
    def __init__(self, name: str, team_id: int):
        self.name = name
        self.team_id = team_id
        self.hand: List[Tile] = []

    def __repr__(self):
        return f"{self.name} (Team {self.team_id}): {self.hand}"


class GameState:
    def __init__(self, players: List[Player]):
        self.players = players
        self.board: List[Tile] = []
        self.history: List[Tuple[str, Tile]] = []
        self.turn = 0
        self.passed_players: List[str] = []

    def current_player(self) -> Player:
        return self.players[self.turn % 4]

    def board_ends(self) -> Optional[Tuple[int, int]]:
        if not self.board:
            return None
        return (self.board[0][0], self.board[-1][1])

    def advance_turn(self):
        self.turn = (self.turn + 1) % 4


def deal_tiles(players: List[Player]):
    tiles = ALL_TILES.copy()
    random.shuffle(tiles)
    for player in players:
        player.hand.clear()
    for i, tile in enumerate(tiles[:28]):
        players[i % 4].hand.append(tile)


def legal_moves(hand: List[Tile], board: List[Tile]) -> List[Tile]:
    if not board:
        return hand
    ends = (board[0][0], board[-1][1])
    legal = []
    for tile in hand:
        if tile[0] in ends or tile[1] in ends:
            legal.append(tile)
    return legal


def apply_move(game_state: GameState, player: Player, tile: Tile, side: str = "right") -> bool:
    if tile not in player.hand:
        return False

    ends = game_state.board_ends()

    if not game_state.board:
        game_state.board.append(tile)
    else:
        if side == "left" and tile[1] == ends[0]:
            game_state.board.insert(0, tile)
        elif side == "left" and tile[0] == ends[0]:
            game_state.board.insert(0, (tile[1], tile[0]))
        elif side == "right" and tile[0] == ends[1]:
            game_state.board.append(tile)
        elif side == "right" and tile[1] == ends[1]:
            game_state.board.append((tile[1], tile[0]))
        else:
            return False

    player.hand.remove(tile)
    game_state.history.append((player.name, tile))
    game_state.passed_players = []
    return True


def play_turn(game_state: GameState):
    player = game_state.current_player()
    moves = legal_moves(player.hand, game_state.board)

    print(f"\nTurno de {player.name}")

    if not moves:
        print(f"{player.name} pasa.")
        game_state.passed_players.append(player.name)
    else:
        tile = moves[0]
        side = "right"
        success = apply_move(game_state, player, tile, side)
        if success:
            print(f"{player.name} juega {tile} al lado {side}.")
        else:
            print(f"{player.name} quiso jugar {tile}, pero fue inválida.")

    game_state.advance_turn()


def simulate_round(game_state: GameState, max_turns: int = 20):
    for _ in range(max_turns):
        print("\nTablero actual:", game_state.board)
        play_turn(game_state)
        if all(len(p.hand) == 0 for p in game_state.players):
            print("\nJuego terminado: alguien se quedó sin fichas.")
            break
        if len(game_state.passed_players) == 4:
            print("\nJuego bloqueado: todos pasaron.")
            break


# Prueba
players = [
    Player("P1", team_id=1),
    Player("P2", team_id=2),
    Player("P3", team_id=1),
    Player("P4", team_id=2)
]

deal_tiles(players)
game_state = GameState(players)

print("=== Estado inicial ===")
for p in players:
    print(p)

simulate_round(game_state)
