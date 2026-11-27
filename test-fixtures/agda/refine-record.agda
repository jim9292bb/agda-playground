module source where

data N : Set where
  z : N
  s : N -> N

record R : Set where
  field
    a : N
    b : N
r : R
r = ?
