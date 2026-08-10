
from typing import List, Tuple, Optional
import random
from copy import deepcopy

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


class DecisionNode:
    def __init__(self, game_state: GameState, parent=None, move=None, depth=0):
        self.game_state = game_state
        self.parent = parent
        self.move = move  # (player_name, tile, side)
        self.children: List["DecisionNode"] = []
        self.depth = depth
        self.value = None  # heurística futura


def expand_node(node: DecisionNode, max_depth: int):
    if node.depth >= max_depth:
        return

    player = node.game_state.current_player()
    moves = legal_moves(player.hand, node.game_state.board)

    if not moves:
        new_state = deepcopy(node.game_state)
        new_state.passed_players.append(player.name)
        new_state.advance_turn()
        child = DecisionNode(new_state, parent=node, move=("PASS", None, None), depth=node.depth + 1)
        node.children.append(child)
        expand_node(child, max_depth)
    else:
        for tile in moves:
            for side in ["left", "right"]:
                new_state = deepcopy(node.game_state)
                success = apply_move(new_state, new_state.current_player(), tile, side)
                if not success:
                    continue
                new_state.advance_turn()
                child = DecisionNode(new_state, parent=node, move=(player.name, tile, side), depth=node.depth + 1)
                node.children.append(child)
                expand_node(child, max_depth)


def evaluate_node(node: DecisionNode) -> int:
    current_player = node.game_state.players[node.game_state.turn % 4]
    return -len(current_player.hand)


# Prueba
if __name__ == "__main__":
    players = [
        Player("P1", team_id=1),
        Player("P2", team_id=2),
        Player("P3", team_id=1),
        Player("P4", team_id=2)
    ]

    deal_tiles(players)
    initial_state = GameState(players)

    print("=== Estado inicial ===")
    for p in players:
        print(p)

    root = DecisionNode(initial_state)
    expand_node(root, max_depth=2)

    print(f"Raíz expandida con {len(root.children)} hijos.")
    for child in root.children:
        print("Movimiento:", child.move, "| Jugador:", child.game_state.current_player().name)
