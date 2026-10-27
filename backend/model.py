"""ResNet18 + custom classification head.

The architecture (and therefore the state-dict key names) must match the
checkpoint from the Hugging Face model card exactly:

    self.model = resnet18(...)
    self.model.fc = Sequential(Dropout(0.5), Linear(512, 512), ReLU(),
                               Dropout(0.3), Linear(512, 26))
"""
from __future__ import annotations

import torch
import torch.nn as nn
from torchvision import models


class SignLanguageModel(nn.Module):
    def __init__(self, num_classes: int = 26, pretrained: bool = False):
        super().__init__()
        self.model = models.resnet18(weights=None)
        if pretrained:
            raise ValueError("pretrained weights are not needed — the checkpoint is loaded on top")
        self.model.fc = nn.Sequential(
            nn.Dropout(0.5),
            nn.Linear(512, 512),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(512, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.model(x)
