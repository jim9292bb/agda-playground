module source where

data N : Set where
  z : N
  s : N -> N

g : N
g = {! z !}

h : N
h = {!!} {!!}
