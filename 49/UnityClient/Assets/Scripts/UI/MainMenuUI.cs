using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;

public class MainMenuUI : MonoBehaviour
{
    [SerializeField] private Button _playerVsAIButton;
    [SerializeField] private Button _aiVsAIButton;
    [SerializeField] private Dropdown _playerUnit1Dropdown;
    [SerializeField] private Dropdown _playerUnit2Dropdown;
    [SerializeField] private Dropdown _enemyAiDropdown;

    private void Start()
    {
        if (_playerVsAIButton != null)
            _playerVsAIButton.onClick.AddListener(OnPlayerVsAIClicked);

        if (_aiVsAIButton != null)
            _aiVsAIButton.onClick.AddListener(OnAIVsAIClicked);

        InitializeDropdowns();

        if (GameClient.Instance != null)
        {
            GameClient.Instance.Connect();
        }
    }

    private void InitializeDropdowns()
    {
        var unitOptions = new List<string> { "warrior", "mage", "archer", "tank" };

        if (_playerUnit1Dropdown != null)
        {
            _playerUnit1Dropdown.ClearOptions();
            _playerUnit1Dropdown.AddOptions(unitOptions);
            _playerUnit1Dropdown.value = 0;
        }

        if (_playerUnit2Dropdown != null)
        {
            _playerUnit2Dropdown.ClearOptions();
            _playerUnit2Dropdown.AddOptions(unitOptions);
            _playerUnit2Dropdown.value = 1;
        }

        var aiOptions = new List<string> { "minimax", "random", "greedy", "decision_tree" };

        if (_enemyAiDropdown != null)
        {
            _enemyAiDropdown.ClearOptions();
            _enemyAiDropdown.AddOptions(aiOptions);
            _enemyAiDropdown.value = 0;
        }
    }

    private void OnPlayerVsAIClicked()
    {
        var playerUnits = new List<string>();

        if (_playerUnit1Dropdown != null)
            playerUnits.Add(_playerUnit1Dropdown.options[_playerUnit1Dropdown.value].text);
        else
            playerUnits.Add("warrior");

        if (_playerUnit2Dropdown != null)
            playerUnits.Add(_playerUnit2Dropdown.options[_playerUnit2Dropdown.value].text);
        else
            playerUnits.Add("mage");

        var enemyAiType = "minimax";
        if (_enemyAiDropdown != null)
            enemyAiType = _enemyAiDropdown.options[_enemyAiDropdown.value].text;

        if (GameManager.Instance != null)
        {
            GameManager.Instance.StartPlayerVsAI(playerUnits, enemyAiType);
            SceneManager.LoadScene("BattleScene");
        }
    }

    private void OnAIVsAIClicked()
    {
        if (GameManager.Instance != null)
        {
            GameManager.Instance.StartAIVsAI("minimax", "random");
            SceneManager.LoadScene("BattleScene");
        }
    }
}
