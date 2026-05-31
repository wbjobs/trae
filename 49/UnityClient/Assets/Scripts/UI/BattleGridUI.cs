using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

public class BattleGridUI : MonoBehaviour
{
    [SerializeField] private int gridSize = 8;
    [SerializeField] private float cellSize = 1f;
    [SerializeField] private GameObject cellPrefab;
    [SerializeField] private GameObject unitPrefab;
    [SerializeField] private Transform gridParent;

    private Dictionary<Vector2Int, GridCell> _cells = new Dictionary<Vector2Int, GridCell>();
    private Dictionary<string, UnitView> _unitViews = new Dictionary<string, UnitView>();

    private BattleState _currentState;
    private UnitData _selectedUnit;
    private BattleAction _pendingAction;

    private void Start()
    {
        CreateGrid();
        GameClient.Instance.OnBattleStateUpdated += OnBattleStateUpdated;
    }

    private void CreateGrid()
    {
        for (int x = 0; x < gridSize; x++)
        {
            for (int y = 0; y < gridSize; y++)
            {
                var position = new Vector3(x * cellSize, 0, y * cellSize);
                var cellObj = Instantiate(cellPrefab, position, Quaternion.identity, gridParent);
                cellObj.name = $"Cell_{x}_{y}";

                var cell = cellObj.GetComponent<GridCell>();
                cell.Initialize(new Vector2Int(x, y));
                cell.OnCellClicked += OnCellClicked;
                _cells[new Vector2Int(x, y)] = cell;
            }
        }
    }

    private void OnBattleStateUpdated(BattleState state)
    {
        _currentState = state;
        UpdateGrid(state.terrain);
        UpdateUnits(state.units);
    }

    private void UpdateGrid(TerrainData terrainData)
    {
        if (terrainData == null) return;

        for (int x = 0; x < terrainData.size; x++)
        {
            for (int y = 0; y < terrainData.size; y++)
            {
                if (_cells.TryGetValue(new Vector2Int(x, y), out var cell))
                {
                    var terrainType = TerrainTypeExtensions.FromString(terrainData.grid[x][y]);
                    cell.SetTerrain(terrainType);
                }
            }
        }
    }

    private void UpdateUnits(List<UnitData> units)
    {
        var existingIds = new HashSet<string>(_unitViews.Keys);
        var currentIds = new HashSet<string>();

        foreach (var unit in units)
        {
            currentIds.Add(unit.id);

            if (_unitViews.TryGetValue(unit.id, out var view))
            {
                view.UpdateData(unit);
            }
            else if (unit.is_alive)
            {
                CreateUnitView(unit);
            }

            existingIds.Remove(unit.id);
        }

        foreach (var id in existingIds)
        {
            if (_unitViews.TryGetValue(id, out var view))
            {
                Destroy(view.gameObject);
                _unitViews.Remove(id);
            }
        }
    }

    private void CreateUnitView(UnitData unit)
    {
        var position = new Vector3(unit.position[0] * cellSize, 0.5f, unit.position[1] * cellSize);
        var unitObj = Instantiate(unitPrefab, position, Quaternion.identity, gridParent);
        unitObj.name = $"Unit_{unit.id}";

        var view = unitObj.GetComponent<UnitView>();
        view.Initialize(unit);
        view.OnUnitClicked += OnUnitClicked;
        _unitViews[unit.id] = view;
    }

    private void OnCellClicked(Vector2Int position)
    {
        if (_pendingAction != null && _pendingAction.action_type == "move")
        {
            _pendingAction.target_position = new int[] { position.x, position.y };
            ExecuteAction(_pendingAction);
            _pendingAction = null;
            ClearHighlights();
        }
    }

    private void OnUnitClicked(UnitData unit)
    {
        if (_pendingAction != null)
        {
            if (_pendingAction.action_type == "attack" || _pendingAction.action_type == "skill")
            {
                _pendingAction.target_id = unit.id;
                ExecuteAction(_pendingAction);
                _pendingAction = null;
                ClearHighlights();
            }
        }
        else
        {
            _selectedUnit = unit;
            ShowValidActions(unit);
        }
    }

    private void ShowValidActions(UnitData unit)
    {
        ClearHighlights();

        if (unit.team != "player" || GameManager.Instance.CurrentMode != GameMode.PlayerVsAI)
            return;

        GameClient.Instance.GetValidActions(GameManager.Instance.CurrentBattleId);
    }

    public void OnMoveButtonClicked()
    {
        if (_selectedUnit == null || _selectedUnit.has_moved) return;

        _pendingAction = new BattleAction
        {
            action_type = "move",
            unit_id = _selectedUnit.id
        };

        HighlightMoveRange(_selectedUnit);
    }

    public void OnAttackButtonClicked()
    {
        if (_selectedUnit == null || _selectedUnit.has_acted) return;

        _pendingAction = new BattleAction
        {
            action_type = "attack",
            unit_id = _selectedUnit.id
        };

        HighlightAttackTargets(_selectedUnit);
    }

    public void OnDefendButtonClicked()
    {
        if (_selectedUnit == null || _selectedUnit.has_acted) return;

        var action = new BattleAction
        {
            action_type = "defend",
            unit_id = _selectedUnit.id
        };

        ExecuteAction(action);
    }

    public void OnSkillButtonClicked(string skillId)
    {
        if (_selectedUnit == null || _selectedUnit.has_acted) return;

        _pendingAction = new BattleAction
        {
            action_type = "skill",
            unit_id = _selectedUnit.id,
            skill_id = skillId
        };

        HighlightSkillTargets(_selectedUnit, skillId);
    }

    private void HighlightMoveRange(UnitData unit)
    {
        foreach (var cell in _cells.Values)
        {
            var distance = Mathf.Abs(cell.Position.x - unit.position[0]) + 
                           Mathf.Abs(cell.Position.y - unit.position[1]);
            if (distance <= unit.move_range && distance > 0)
            {
                cell.SetHighlight(HighlightType.Move);
            }
        }
    }

    private void HighlightAttackTargets(UnitData unit)
    {
        foreach (var kvp in _unitViews)
        {
            var otherUnit = kvp.Value.UnitData;
            if (otherUnit.team != unit.team && otherUnit.is_alive)
            {
                var distance = Mathf.Abs(otherUnit.position[0] - unit.position[0]) + 
                               Mathf.Abs(otherUnit.position[1] - unit.position[1]);
                if (distance <= unit.attack_range)
                {
                    kvp.Value.SetHighlight(HighlightType.Attack);
                }
            }
        }
    }

    private void HighlightSkillTargets(UnitData unit, string skillId)
    {
    }

    private void ClearHighlights()
    {
        foreach (var cell in _cells.Values)
        {
            cell.ClearHighlight();
        }
        foreach (var unitView in _unitViews.Values)
        {
            unitView.ClearHighlight();
        }
    }

    private void ExecuteAction(BattleAction action)
    {
        GameManager.Instance.ExecutePlayerAction(action);
    }

    public void OnEndTurnClicked()
    {
        GameManager.Instance.EndPlayerTurn();
        _selectedUnit = null;
        ClearHighlights();
    }

    private void OnDestroy()
    {
        if (GameClient.Instance != null)
        {
            GameClient.Instance.OnBattleStateUpdated -= OnBattleStateUpdated;
        }
    }
}

public enum HighlightType
{
    None,
    Move,
    Attack,
    Skill
}
