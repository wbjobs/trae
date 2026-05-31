// Copyright Epic Games, Inc. All Rights Reserved.

#include "GrassWindComponent.h"
#include "Materials/MaterialParameterCollection.h"
#include "Materials/MaterialParameterCollectionInstance.h"
#include "NiagaraComponent.h"
#include "NiagaraSystem.h"

UGrassWindComponent::UGrassWindComponent()
{
	PrimaryComponentTick.bCanEverTick = true;

	bEnableWind = true;
	WindStrength = 10.0f;
	WindFrequency = 1.0f;
	WindSpeed = 1.0f;
	WindDirection = FVector(1.0f, 0.5f, 0.0f);
	WindFieldSystem = nullptr;
	WindFieldExtent = FVector(5000.0f, 5000.0f, 100.0f);
	WindFieldSamples = 20;
	WindParameterCollection = nullptr;

	GustStrength = 5.0f;
	GustFrequency = 0.5f;
	TurbulenceStrength = 2.0f;

	WindTime = 0.0f;
	CurrentGust = 0.0f;
	CurrentTurbulence = 0.0f;
}

void UGrassWindComponent::BeginPlay()
{
	Super::BeginPlay();
	UpdateWindParameters();
}

void UGrassWindComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	if (!bEnableWind)
	{
		return;
	}

	WindTime += DeltaTime * WindSpeed;

	const float GustPhase = WindTime * GustFrequency * PI;
	CurrentGust = FMath::Sin(GustPhase) * FMath::Max(0.0f, FMath::Sin(GustPhase * 0.5f));

	CurrentTurbulence = FMath::Sin(WindTime * WindFrequency * 3.0f) * FMath::Cos(WindTime * WindFrequency * 2.3f);

	UpdateWindField();
	UpdateMaterialCollection();
}

void UGrassWindComponent::UpdateWindParameters()
{
	WindDirection.Normalize();
	UpdateWindField();
	UpdateMaterialCollection();
}

float UGrassWindComponent::GetWindOffset(const FVector& Position) const
{
	if (!bEnableWind)
	{
		return 0.0f;
	}

	const float BaseWind = CalculateWindNoise(Position, WindTime);
	const float GustWind = CurrentGust * GustStrength;
	const float TurbWind = CurrentTurbulence * TurbulenceStrength;

	return (BaseWind * WindStrength + GustWind + TurbWind) * 0.1f;
}

FVector UGrassWindComponent::GetWindVector(const FVector& Position) const
{
	if (!bEnableWind)
	{
		return FVector::ZeroVector;
	}

	const float Offset = GetWindOffset(Position);
	const FVector PerpendicularDir = FVector(-WindDirection.Y, WindDirection.X, 0.0f).GetSafeNormal();
	const float SideOffset = FMath::Sin(WindTime * WindFrequency + Position.X * 0.01f + Position.Y * 0.01f) * 0.3f;

	return WindDirection * Offset + PerpendicularDir * Offset * SideOffset;
}

void UGrassWindComponent::SetWindStrength(float NewStrength)
{
	WindStrength = FMath::Max(0.0f, NewStrength);
	UpdateMaterialCollection();
}

void UGrassWindComponent::SetWindDirection(const FVector& NewDirection)
{
	WindDirection = NewDirection.GetSafeNormal();
	UpdateMaterialCollection();
}

void UGrassWindComponent::UpdateWindField()
{
	if (WindFieldSamples <= 0)
	{
		return;
	}

	WindFieldSampleResults.SetNum(WindFieldSamples * WindFieldSamples);

	const FVector Origin = GetOwner() ? GetOwner()->GetActorLocation() : FVector::ZeroVector;

	for (int32 Y = 0; Y < WindFieldSamples; Y++)
	{
		for (int32 X = 0; X < WindFieldSamples; X++)
		{
			const FVector SamplePos = Origin + FVector(
				(X - WindFieldSamples / 2.0f) * WindFieldExtent.X / WindFieldSamples,
				(Y - WindFieldSamples / 2.0f) * WindFieldExtent.Y / WindFieldSamples,
				0.0f
			);

			WindFieldSampleResults[Y * WindFieldSamples + X] = GetWindVector(SamplePos);
		}
	}
}

void UGrassWindComponent::UpdateMaterialCollection()
{
	if (!WindParameterCollection)
	{
		return;
	}

	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	UMaterialParameterCollectionInstance* Instance = World->GetParameterCollectionInstance(WindParameterCollection);
	if (!Instance)
	{
		return;
	}

	Instance->SetVectorParameter(FName("WindDirection"), FLinearColor(WindDirection.X, WindDirection.Y, WindDirection.Z, 0.0f));
	Instance->SetScalarParameter(FName("WindStrength"), WindStrength);
	Instance->SetScalarParameter(FName("WindFrequency"), WindFrequency);
	Instance->SetScalarParameter(FName("WindTime"), WindTime);
	Instance->SetScalarParameter(FName("GustStrength"), CurrentGust * GustStrength);
	Instance->SetScalarParameter(FName("Turbulence"), CurrentTurbulence * TurbulenceStrength);
}

float UGrassWindComponent::CalculateWindNoise(const FVector& Position, float Time) const
{
	const float Wave1 = FMath::Sin(Position.X * 0.01f * WindFrequency + Time * WindFrequency);
	const float Wave2 = FMath::Sin(Position.Y * 0.013f * WindFrequency + Time * WindFrequency * 1.1f);
	const float Wave3 = FMath::Sin((Position.X + Position.Y) * 0.007f * WindFrequency + Time * WindFrequency * 0.9f);

	return (Wave1 + Wave2 + Wave3) / 3.0f;
}
