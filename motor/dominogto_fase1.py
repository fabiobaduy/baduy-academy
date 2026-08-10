
from typing import List, Tuple, Dict, Optional
import random

# Tipo de ficha: tupla de dos enteros
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
        self.players = players  # Orden de turnos
        self.board: List[Tile] = []
        self.history: List[Tuple[str, Tile]] = []  # (jugador, ficha jugada)
        self.turn = 0  # Índice del jugador actual
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


# Prueba básica para mostrar el estado inicial
def print_game_state(state: GameState):
    print("=== Estado inicial ===")
    for p in state.players:
        print(p)
    print("Tablero:", state.board)
    print("Jugador actual:", state.current_player().name)


# Crear jugadores
players = [
    Player("P1", team_id=1),
    Player("P2", team_id=2),
    Player("P3", team_id=1),
    Player("P4", team_id=2)
]

# Inicializar juego
deal_tiles(players)
game_state = GameState(players)

# Mostrar estado inicial
print_game_state(game_state)

# Mostrar jugadas legales del primer jugador
player = game_state.current_player()
moves = legal_moves(player.hand, game_state.board)
print(f"\nJugadas legales para {player.name}:", moves)
