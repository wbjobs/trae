using System;
using System.Collections.Generic;

[Serializable]
public class BattleState
{
    public string id;
    public string state;
    public int turn;
    public string current_team;
    public UnitData current_unit;
    public List<UnitData> units;
    public TerrainData terrain;
    public string winner;
    public int log_count;
}

[Serializable]
public class BattleAction
{
    public string action_type;
    public string unit_id;
    public string target_id;
    public int[] target_position;
    public string skill_id;
}

[Serializable]
public class BattleResult
{
    public bool success;
    public string message;
    public Dictionary<string, object> data;
}
