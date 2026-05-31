// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "GrassWindComponent.generated.h"

class UMaterialParameterCollection;
class UNiagaraComponent;
class UNiagaraSystem;

UCLASS(ClassGroup = (Grass), meta = (BlueprintSpawnableComponent))
class GRASSCULLING_API UGrassWindComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UGrassWindComponent();

	virtual void BeginPlay() override;

	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Wind")
	bool bEnableWind;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Wind", meta = (ClampMin = "0.0", UIMin = "0.0"))
	float WindStrength;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Wind", meta = (ClampMin = "0.0", UIMin = "0.0"))
	float WindFrequency;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Wind", meta = (ClampMin = "0.0", UIMin = "0.0"))
	float WindSpeed;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Wind")
	FVector WindDirection;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Wind")
	UNiagaraSystem* WindFieldSystem;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Wind")
	FVector WindFieldExtent;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Wind")
	int32 WindFieldSamples;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Wind")
	UMaterialParameterCollection* WindParameterCollection;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Wind")
	float GustStrength;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Wind")
	float GustFrequency;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Wind")
	float TurbulenceStrength;

	UPROPERTY(VisibleAnywhere, Category = "Wind")
	TArray<FVector> WindFieldSampleResults;

	UFUNCTION(BlueprintCallable, Category = "Wind")
	void UpdateWindParameters();

	UFUNCTION(BlueprintCallable, Category = "Wind")
	float GetWindOffset(const FVector& Position) const;

	UFUNCTION(BlueprintCallable, Category = "Wind")
	FVector GetWindVector(const FVector& Position) const;

	UFUNCTION(BlueprintCallable, Category = "Wind")
	void SetWindStrength(float NewStrength);

	UFUNCTION(BlueprintCallable, Category = "Wind")
	void SetWindDirection(const FVector& NewDirection);

protected:
	float WindTime;
	float CurrentGust;
	float CurrentTurbulence;

	void UpdateWindField();
	void UpdateMaterialCollection();
	float CalculateWindNoise(const FVector& Position, float Time) const;
};
