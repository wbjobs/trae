using System;
using System.Collections.Generic;

[Serializable]
public class UnitData
{
    public string id;
    public string type;
    public string team;
    public string name;
    public int[] position;
    public float hp;
    public float max_hp;
    public float attack;
    public float defense;
    public float speed;
    public int attack_range;
    public int move_range;
    public List<string> skills;
    public Dictionary<string, int> skill_cooldowns;
    public List<EffectData> effects;
    public bool is_alive;
    public bool has_moved;
    public bool has_acted;
}

[Serializable]
public class EffectData
{
    public string type;
    public float value;
    public int duration;
}
