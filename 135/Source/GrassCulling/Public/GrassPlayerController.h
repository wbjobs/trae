// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "GrassPlayerController.generated.h"

class AGrassManager;
class UGrassStatWidget;
class UInputAction;
class UInputMappingContext;

UCLASS()
class GRASSCULLING_API AGrassPlayerController : public APlayerController
{
	GENERATED_BODY()

public:
	AGrassPlayerController();

	virtual void BeginPlay() override;

	virtual void SetupInputComponent() override;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Grass|Config")
	TSubclassOf<UGrassStatWidget> StatWidgetClass;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Grass|Config")
	FName StatWidgetTag;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Grass|Input")
	UInputAction* ToggleStatsAction;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Grass|Input")
	UInputMappingContext* InputMappingContext;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Grass|Input")
	int32 InputMappingPriority;

	UFUNCTION(BlueprintCallable, Category = "Grass")
	void ToggleStatsDisplay();

	UFUNCTION(BlueprintCallable, Category = "Grass")
	void SetGrassManager(AGrassManager* InManager);

protected:
	UPROPERTY()
	UGrassStatWidget* StatWidget;

	UPROPERTY()
	AGrassManager* GrassManager;
};
