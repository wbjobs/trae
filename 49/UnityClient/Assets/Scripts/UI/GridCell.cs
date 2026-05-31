using System;
using UnityEngine;

public class GridCell : MonoBehaviour
{
    public Vector2Int Position { get; private set; }
    public TerrainType TerrainType { get; private set; }

    [SerializeField] private Renderer _renderer;
    [SerializeField] private Color plainColor = new Color(0.7f, 0.8f, 0.7f);
    [SerializeField] private Color forestColor = new Color(0.3f, 0.6f, 0.3f);
    [SerializeField] private Color mountainColor = new Color(0.5f, 0.5f, 0.5f);
    [SerializeField] private Color waterColor = new Color(0.3f, 0.5f, 0.8f);

    [SerializeField] private Color moveHighlightColor = new Color(0.5f, 0.8f, 0.5f, 0.5f);
    [SerializeField] private Color attackHighlightColor = new Color(0.8f, 0.3f, 0.3f, 0.5f);
    [SerializeField] private Color skillHighlightColor = new Color(0.5f, 0.5f, 0.9f, 0.5f);

    private Color _originalColor;
    private HighlightType _currentHighlight = HighlightType.None;

    public event Action<Vector2Int> OnCellClicked;

    public void Initialize(Vector2Int position)
    {
        Position = position;
    }

    public void SetTerrain(TerrainType terrainType)
    {
        TerrainType = terrainType;
        UpdateTerrainColor();
    }

    private void UpdateTerrainColor()
    {
        if (_renderer == null) return;

        switch (TerrainType)
        {
            case TerrainType.PLAIN:
                _originalColor = plainColor;
                break;
            case TerrainType.FOREST:
                _originalColor = forestColor;
                break;
            case TerrainType.MOUNTAIN:
                _originalColor = mountainColor;
                break;
            case TerrainType.WATER:
                _originalColor = waterColor;
                break;
        }

        _renderer.material.color = _originalColor;
    }

    public void SetHighlight(HighlightType type)
    {
        _currentHighlight = type;
        UpdateHighlight();
    }

    public void ClearHighlight()
    {
        _currentHighlight = HighlightType.None;
        UpdateHighlight();
    }

    private void UpdateHighlight()
    {
        if (_renderer == null) return;

        switch (_currentHighlight)
        {
            case HighlightType.None:
                _renderer.material.color = _originalColor;
                break;
            case HighlightType.Move:
                _renderer.material.color = moveHighlightColor;
                break;
            case HighlightType.Attack:
                _renderer.material.color = attackHighlightColor;
                break;
            case HighlightType.Skill:
                _renderer.material.color = skillHighlightColor;
                break;
        }
    }

    private void OnMouseDown()
    {
        OnCellClicked?.Invoke(Position);
    }
}
