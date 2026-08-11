data Unit : Set where
  unit : Unit

module Outer where
  module Nested where
    nestedValue : Set₁
    nestedValue = Set

  outerValue : Set₁
  outerValue = Set
