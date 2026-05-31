using System;

[Serializable]
public class TerrainData
{
    public int size;
    public string[][] grid;
}

public enum TerrainType
{
    PLAIN,
    FOREST,
    MOUNTAIN,
    WATER
}

public static class TerrainTypeExtensions
{
    public static TerrainType FromString(string typeStr)
    {
        switch (typeStr.ToLower())
        {
            case "plain": return TerrainType.PLAIN;
            case "forest": return TerrainType.FOREST;
            case "mountain": return TerrainType.MOUNTAIN;
            case "water": return TerrainType.WATER;
            default: return TerrainType.PLAIN;
        }
    }
}
