// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "GrassStatWidget.generated.h"

class AGrassManager;
class UTextBlock;
class UProgressBar;
class UCanvasPanel;

UCLASS()
class GRASSCULLING_API UGrassStatWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	virtual void NativeConstruct() override;

	virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

	UPROPERTY(BlueprintReadWrite, Category = "Grass|Config")
	AGrassManager* GrassManager;

	UPROPERTY(meta = (BindWidget))
	UTextBlock* StatsText;

	UPROPERTY(meta = (BindWidget))
	UTextBlock* EfficiencyText;

	UPROPERTY(meta = (BindWidget))
	UTextBlock* CountText;

	UPROPERTY(meta = (BindWidget))
	UProgressBar* EfficiencyBar;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Grass|Config")
	float UpdateInterval;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Grass|Display")
	bool bShowOnScreen;

	UFUNCTION(BlueprintCallable, Category = "Grass")
	void SetGrassManager(AGrassManager* InManager);

	UFUNCTION(BlueprintCallable, Category = "Grass")
	void UpdateStatsDisplay();

	UFUNCTION(BlueprintCallable, Category = "Grass")
	void ToggleVisibility();

protected:
	float TimeSinceLastUpdate;
};
