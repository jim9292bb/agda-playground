module source where

data N : Set where
  z : N
  s : N -> N

a : N
a = {! z !}

b : N
b = {! s z !}
